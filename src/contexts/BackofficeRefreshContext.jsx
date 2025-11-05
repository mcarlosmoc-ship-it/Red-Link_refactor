import React, { createContext, useContext } from 'react'

const BackofficeRefreshContext = createContext({ isRefreshing: false })

export const BackofficeRefreshProvider = BackofficeRefreshContext.Provider

export const useBackofficeRefresh = () => {
  return useContext(BackofficeRefreshContext)
}

export default BackofficeRefreshContext
