const PaymentMessageFormatter = require('../formatters/PaymentMessageFormatter')

/**
 * Caso de uso: Procesar webhook de pago
 * Patrón: Use Case Pattern / Command Pattern
 */
class ProcessPaymentWebhookUseCase {
  constructor(mercadoPagoService, telegramService) {
    this.mercadoPagoService = mercadoPagoService
    this.telegramService = telegramService
  }

  async execute(paymentId) {
    console.log(`Consultando detalles del pago ${paymentId}...`)

    // 1. Obtener detalles del pago
    const paymentData = await this.mercadoPagoService.getPaymentDetails(paymentId)
    console.log("Datos del pago obtenidos:", JSON.stringify(paymentData, null, 2))

    // 2. Verificar si el pago está aprobado
    if (paymentData.status !== "approved") {
      console.log(`Pago ${paymentId} no está aprobado. Status: ${paymentData.status}`)
      return {
        success: false,
        status: paymentData.status,
        message: "Payment not approved yet"
      }
    }

    // 3. FILTRAR: Solo notificar transferencias (NO tarjetas)
    const paymentType = paymentData.payment_type_id
    const allowedTypes = ["bank_transfer", "account_money", "ticket"]

    if (!allowedTypes.includes(paymentType)) {
      console.log(`Pago tipo ${paymentType} (tarjeta) - No se envía notificación`)
      return {
        success: true,
        paymentId,
        message: `Payment type ${paymentType} ignored (card payment)`
      }
    }

    console.log(`✅ Pago tipo ${paymentType} - Se enviará notificación`)

    // 4. Formatear mensaje
    const message = PaymentMessageFormatter.format(paymentData)

    // 5. Enviar notificación
    console.log("Enviando notificación a Telegram...")
    await this.telegramService.sendMessage(message)
    console.log("✅ Notificación enviada a Telegram")

    return {
      success: true,
      paymentId,
      message: "Notificación enviada correctamente"
    }
  }
}

module.exports = ProcessPaymentWebhookUseCase
