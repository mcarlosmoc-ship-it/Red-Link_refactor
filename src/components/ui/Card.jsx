import React from 'react'
function clsx(...xs){ return xs.filter(Boolean).join(' ') }
export function Card({ className='', ...props }){ return <div className={clsx('bg-white rounded-lg shadow', className)} {...props} /> }
export function CardContent({ className='', ...props }){ return <div className={clsx('p-4', className)} {...props} /> }
