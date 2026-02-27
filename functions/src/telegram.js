const PAYMENT_METHOD_LABELS = {
  "credit_card": "Tarjeta de Crédito",
  "debit_card": "Tarjeta de Débito",
  "bank_transfer": "Transferencia",
  "ticket": "Efectivo",
  "account_money": "Dinero en cuenta",
}

function formatPaymentMessage(payment) {
  const amount = payment.transaction_amount || "N/A"

  const dateCreated = payment.date_created || payment.date_approved
  const paymentDate = dateCreated
    ? new Date(dateCreated).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Fecha desconocida"

  const paymentMethod = PAYMENT_METHOD_LABELS[payment.payment_type_id] || payment.payment_type_id || "N/A"
  const isBankTransfer = payment.payment_type_id === "bank_transfer"
  const transactionId = payment.transaction_details?.transaction_id || ""
  const escapedTxId = transactionId ? transactionId.replace(/_/g, "\\_") : ""
  const statusDetail = payment.status_detail === "accredited" ? "Acreditado" : payment.status_detail || ""

  return `💰 *PAGO CONFIRMADO*

Monto: $${amount}
Fecha: ${paymentDate}
${isBankTransfer && transactionId ? `ID Transacción: \`${escapedTxId}\`` : ""}

Método: ${paymentMethod}
Estado: ${statusDetail}`
}

async function sendMessage(botToken, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Telegram API error: ${data.description}`)
  }
  return data
}

module.exports = { formatPaymentMessage, sendMessage }
