export const peso=(n)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n??0)
export const today=()=>new Date().toLocaleDateString()
