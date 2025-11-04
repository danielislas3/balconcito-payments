const PaymentMessageFormatter = require('../formatters/PaymentMessageFormatter')

/**
 * Caso de uso: Revisar movimientos recientes
 * Se ejecuta cada 2 minutos para detectar nuevos ingresos
 */
class CheckRecentMovementsUseCase {
  constructor(mercadoPagoService, telegramService, db) {
    this.mercadoPagoService = mercadoPagoService
    this.telegramService = telegramService
    this.db = db
  }

  async execute() {
    console.log("🔍 Revisando pagos recientes...")

    try {
      // 1. Consultar pagos recientes (última hora)
      const response = await this.mercadoPagoService.getRecentPayments(20)
      const payments = response.results || []

      console.log(`📊 Encontrados ${payments.length} pagos`)

      // 2. Filtrar solo pagos aprobados y de tipo transferencia
      const allowedTypes = ["bank_transfer", "account_money", "ticket"]
      const approvedPayments = payments.filter(p =>
        p.status === "approved" && allowedTypes.includes(p.payment_type_id)
      )
      console.log(`💰 ${approvedPayments.length} pagos aprobados (transferencias)`)

      // 3. Procesar solo pagos nuevos
      let newPaymentsCount = 0
      for (const payment of approvedPayments) {
        const paymentId = payment.id.toString()

        // Verificar si ya fue procesado (usando Firestore)
        const docRef = this.db.collection("processedPayments").doc(paymentId)
        const doc = await docRef.get()

        if (!doc.exists) {
          console.log(`✅ Nuevo pago detectado: ${paymentId}`)

          // Formatear y enviar notificación (usar el formateador de pagos existente)
          const message = PaymentMessageFormatter.format(payment)
          await this.telegramService.sendMessage(message)

          // Marcar como procesado
          await docRef.set({
            processedAt: Date.now(),
            amount: payment.transaction_amount,
            date: payment.date_created,
            type: payment.payment_type_id
          })

          newPaymentsCount++
        }
      }

      console.log(`📨 Enviadas ${newPaymentsCount} notificaciones nuevas`)

      return {
        success: true,
        totalPayments: payments.length,
        newPayments: newPaymentsCount
      }

    } catch (error) {
      console.error("❌ Error al revisar pagos:", error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

}

module.exports = CheckRecentMovementsUseCase
