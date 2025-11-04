/**
 * Servicio de Mercado Pago
 * Responsabilidad: Comunicación con la API de Mercado Pago
 */
class MercadoPagoService {
  constructor(accessToken) {
    this.accessToken = accessToken
    this.apiUrl = "https://api.mercadopago.com/v1"
  }

  async getPaymentDetails(paymentId) {
    const url = `${this.apiUrl}/payments/${paymentId}`
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData.message || response.statusText

      if (response.status === 404) {
        throw new Error(`Payment ${paymentId} not found (404). This is likely a test webhook with a fake ID.`)
      }

      throw new Error(`Mercado Pago API error ${response.status}: ${errorMsg}`)
    }

    return await response.json()
  }

  async getRecentPayments(limit = 10) {
    // Buscar pagos recientes de las últimas 24 horas
    const url = `${this.apiUrl}/payments/search?sort=date_created&criteria=desc&limit=${limit}`
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData.message || response.statusText
      throw new Error(`Mercado Pago API error ${response.status}: ${errorMsg}`)
    }

    return await response.json()
  }
}

module.exports = MercadoPagoService
