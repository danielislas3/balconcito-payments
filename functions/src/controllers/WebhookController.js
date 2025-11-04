/**
 * Controlador del webhook
 */
class WebhookController {
  constructor(signatureValidator, processPaymentUseCase) {
    this.signatureValidator = signatureValidator
    this.processPaymentUseCase = processPaymentUseCase
  }

  async handle(req, res) {
    res.set("Access-Control-Allow-Origin", "*")
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.set("Access-Control-Allow-Headers", "Content-Type")

     if (req.method === "OPTIONS") {
      return res.status(204).send("")
    }

     if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" })
    }

    try {
      console.log("Webhook recibido:", JSON.stringify(req.body, null, 2))

       if (!this.signatureValidator.validate(req)) {
        console.error("Firma inválida de Mercado Pago")
        return res.status(401).json({ error: "Invalid signature" })
      }
 
      const { data, type, action } = req.body
      if (!data || !data.id) {
        return res.status(400).json({ error: "Invalid payload" })
      }

       if (type !== "payment" && action !== "payment.updated") {
        console.log(`Evento ignorado. Type: ${type}, Action: ${action}`)
        return res.status(200).json({ received: true, ignored: true })
      }

       const result = await this.processPaymentUseCase.execute(data.id)

      return res.status(200).json(result)

    } catch (error) {
      console.error("Error:", error.message)
      return res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString(),
      })
    }
  }
}

module.exports = WebhookController
