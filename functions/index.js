const { onRequest } = require("firebase-functions/v2/https")
const { onSchedule } = require("firebase-functions/v2/scheduler")
const admin = require("firebase-admin")
const mp = require("./src/mercadopago")
const telegram = require("./src/telegram")

admin.initializeApp()

const ALLOWED_PAYMENT_TYPES = ["bank_transfer", "account_money"]

// ============================================
// WEBHOOK: Mercado Pago → Telegram
// ============================================
exports.mpWebhook = onRequest({ region: "us-central1" }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*")
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.set("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") return res.status(204).send("")
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    console.log("Webhook recibido:", JSON.stringify(req.body, null, 2))

    if (!mp.validateSignature(req, process.env.MP_SECRET)) {
      console.error("Firma inválida de Mercado Pago")
      return res.status(401).json({ error: "Invalid signature" })
    }

    const { data, type, action } = req.body
    if (!data || !data.id) return res.status(400).json({ error: "Invalid payload" })

    if (type !== "payment" && action !== "payment.updated") {
      console.log(`Evento ignorado. Type: ${type}, Action: ${action}`)
      return res.status(200).json({ received: true, ignored: true })
    }

    const payment = await mp.getPaymentDetails(process.env.MP_ACCESS_TOKEN, data.id)
    console.log("Datos del pago:", JSON.stringify(payment, null, 2))

    if (payment.status !== "approved") {
      return res.status(200).json({ success: false, status: payment.status })
    }

    if (!ALLOWED_PAYMENT_TYPES.includes(payment.payment_type_id)) {
      console.log(`Pago tipo ${payment.payment_type_id} - ignorado`)
      return res.status(200).json({ success: true, message: "Payment type ignored" })
    }

    if (payment.point_of_interaction?.type === "CASHBACKS") {
      console.log(`Pago es cashback/interés - ignorado`)
      return res.status(200).json({ success: true, message: "Cashback ignored" })
    }

    const message = telegram.formatPaymentMessage(payment)
    await telegram.sendMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, message)
    console.log("Notificación enviada a Telegram")

    return res.status(200).json({ success: true, paymentId: data.id })

  } catch (error) {
    console.error("Error:", error.message)
    return res.status(500).json({ error: error.message })
  }
})

// ============================================
// SCHEDULED: Revisar pagos recientes (cada 3 min)
// Detecta transferencias directas que no disparan webhooks
// ============================================
exports.checkMovements = onSchedule(
  { schedule: "every 3 minutes", region: "us-central1", timeZone: "America/Mexico_City" },
  async () => {
    // Fuera de horario de operación (6am-4pm) no ejecutar
    const now = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
    const hour = new Date(now).getHours()
    if (hour >= 6 && hour < 16) {
      console.log(`Fuera de horario de operación (${hour}h). Saltando.`)
      return
    }

    try {
      const response = await mp.getRecentPayments(process.env.MP_ACCESS_TOKEN, 20)
      const payments = (response.results || []).filter(
        (p) => p.status === "approved"
          && ALLOWED_PAYMENT_TYPES.includes(p.payment_type_id)
          && p.point_of_interaction?.type !== "CASHBACKS"
      )

      console.log(`${payments.length} pagos aprobados (transferencias)`)

      const db = admin.firestore()
      let newCount = 0

      for (const payment of payments) {
        const docRef = db.collection("processedPayments").doc(payment.id.toString())
        const doc = await docRef.get()

        if (!doc.exists) {
          console.log(`Nuevo pago detectado: ${payment.id}`)
          const message = telegram.formatPaymentMessage(payment)
          await telegram.sendMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, message)

          await docRef.set({
            processedAt: Date.now(),
            amount: payment.transaction_amount,
            netReceived: payment.transaction_details?.net_received_amount || null,
            date: payment.date_created,
            type: payment.payment_type_id,
            method: payment.payment_method_id || null,
            e2eId: payment.point_of_interaction?.transaction_data?.e2e_id || null,
            status: payment.status,
            moneyReleased: payment.money_release_status === "released",
          })
          newCount++
        }
      }

      console.log(`${newCount} notificaciones nuevas enviadas`)

    } catch (error) {
      console.error("Error al revisar pagos:", error.message)
    }
  }
)
