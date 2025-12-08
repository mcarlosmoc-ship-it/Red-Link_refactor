export const isPosCartValidationEnabled = () =>
  String(import.meta.env?.VITE_POS_CART_VALIDATION ?? 'true').toLowerCase() !== 'false'

export default isPosCartValidationEnabled
