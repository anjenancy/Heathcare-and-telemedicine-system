const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
export async function api(path, options={}) {
  const token = localStorage.getItem('careconnect_token')
  const res = await fetch(API + path, {
    headers: {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(options.headers||{})},
    ...options
  })
  const data = await res.json().catch(()=>({}))
  if (!res.ok) throw new Error(data.error || data.message || 'Something went wrong')
  return data
}
