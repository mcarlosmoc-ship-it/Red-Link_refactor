import React from 'react'
function clsx(...xs){ return xs.filter(Boolean).join(' ') }
export default function Button({ className='', variant='default', size='md', ...props }){
  const base='inline-flex items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-blue-500/40'
  const sizes=size==='sm'?'text-sm px-3 py-1.5':'px-4 py-2'
  const variants=variant==='ghost'?'bg-transparent text-gray-700 hover:bg-gray-100':'bg-blue-600 text-white hover:bg-blue-700'
  return <button className={clsx(base,sizes,variants,className)} {...props} />
}
