import { apiClient } from './apiClient.js'

export const requestAccessToken = async ({ username, password, otpCode }) => {
  const payload = {
    username,
    password,
  }

  if (otpCode) {
    payload.otp_code = otpCode
  }

  const { data } = await apiClient.post('/auth/token', payload, { auth: false })
  return data
}
