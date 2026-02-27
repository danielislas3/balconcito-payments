const crypto = require("crypto")

const API_URL = "https://api.mercadopago.com/v1"

function validateSignature(req, secret) {
  if (!secret) return true

  const xSignature = req.headers["x-signature"]
  const xRequestId = req.headers["x-request-id"]
  if (!xSignature || !xRequestId) return true

  const parts = xSignature.split(",")
  let ts, hash
  for (const part of parts) {
    const [key, value] = part.split("=")
    if (key?.trim() === "ts") ts = value?.trim()
    if (key?.trim() === "v1") hash = value?.trim()
  }
  if (!ts || !hash) return false

  const dataID = req.body?.data?.id || ""
  const manifest = `id:${dataID};request-id:${xRequestId};ts:${ts};`
  const calculated = crypto.createHmac("sha256", secret).update(manifest).digest("hex")
  return calculated === hash
}

async function getPaymentDetails(accessToken, paymentId) {
  const response = await fetch(`${API_URL}/payments/${paymentId}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMsg = errorData.message || response.statusText
    if (response.status === 404) {
      throw new Error(`Payment ${paymentId} not found (404). Likely a test webhook with a fake ID.`)
    }
    throw new Error(`Mercado Pago API error ${response.status}: ${errorMsg}`)
  }

  return response.json()
}

async function getRecentPayments(accessToken, limit = 20) {
  const response = await fetch(
    `${API_URL}/payments/search?sort=date_created&criteria=desc&limit=${limit}`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Mercado Pago API error ${response.status}: ${errorData.message || response.statusText}`)
  }

  return response.json()
}

module.exports = { validateSignature, getPaymentDetails, getRecentPayments }
