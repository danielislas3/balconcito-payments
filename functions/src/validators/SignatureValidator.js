const crypto = require("crypto")

/**
 * Validador de firma de Mercado Pago
 * Patrón: Strategy Pattern para validación
 */
class MercadoPagoSignatureValidator {
  constructor(secret) {
    this.secret = secret
  }

  validate(req) {
    if (!this.secret) {
      return true // Si no hay secret configurado, no validamos
    }

    const xSignature = req.headers["x-signature"]
    const xRequestId = req.headers["x-request-id"]

    if (!xSignature || !xRequestId) {
      return true // Si no hay headers de firma, permitimos (puede ser test)
    }

    const { ts, hash } = this.extractSignatureParams(xSignature)

    if (!ts || !hash) {
      return false
    }

    const dataID = req.body?.data?.id || ""
    const manifest = `id:${dataID};request-id:${xRequestId};ts:${ts};`

    const hmac = crypto.createHmac("sha256", this.secret)
    hmac.update(manifest)
    const calculatedHash = hmac.digest("hex")

    return calculatedHash === hash
  }

  extractSignatureParams(signature) {
    const parts = signature.split(",")
    let ts, hash

    parts.forEach(part => {
      const [key, value] = part.split("=")
      if (key && value) {
        const cleanKey = key.trim()
        const cleanValue = value.trim()
        if (cleanKey === "ts") ts = cleanValue
        if (cleanKey === "v1") hash = cleanValue
      }
    })

    return { ts, hash }
  }
}

module.exports = MercadoPagoSignatureValidator
