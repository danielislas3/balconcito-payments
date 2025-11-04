/**
 * Formateador de mensajes de pago
 * Responsabilidad: Formatear datos de pago para Telegram
 */
class PaymentMessageFormatter {
  static format(paymentData) {
    const amount = paymentData.transaction_amount || "N/A"

    // Obtener fecha real del pago (no la hora actual)
    const dateCreated = paymentData.date_created || paymentData.date_approved
    const paymentDate = dateCreated
      ? new Date(dateCreated).toLocaleString("es-MX", {
          timeZone: "America/Mexico_City",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })
      : "Fecha desconocida"

    const paymentMethod = this.getPaymentMethodLabel(paymentData.payment_type_id)

    // Obtener ID de transacción SPEI si existe
    const transactionId = paymentData.transaction_details?.transaction_id || ""

    // Para transferencias bancarias, mostrar transaction_id
    const isBankTransfer = paymentData.payment_type_id === "bank_transfer"

    // Escapar caracteres especiales de Markdown en transaction_id
    const escapedTransactionId = transactionId ? transactionId.replace(/_/g, '\\_') : ''

    // Estado del pago
    const statusDetail = paymentData.status_detail === "accredited" ? "Acreditado" : paymentData.status_detail || ""

    return `💰 *PAGO CONFIRMADO*

Monto: $${amount}
Fecha: ${paymentDate}
${isBankTransfer && transactionId ? `ID Transacción: \`${escapedTransactionId}\`` : ''}

Método: ${paymentMethod}
Estado: ${statusDetail}`
  }

  static getPaymentMethodLabel(paymentTypeId) {
    const labels = {
      "credit_card": "Tarjeta de Crédito",
      "debit_card": "Tarjeta de Débito",
      "bank_transfer": "Transferencia",
      "ticket": "Efectivo",
      "account_money": "Dinero en cuenta",
    }
    return labels[paymentTypeId] || paymentTypeId || "N/A"
  }
}

module.exports = PaymentMessageFormatter
