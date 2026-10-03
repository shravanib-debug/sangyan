import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function connectBroker() {
  // In a real app, we would redirect to Zerodha's hosted login page:
  // const url = `https://kite.zerodha.com/connect/login?v=3&api_key=${process.env.ZERODHA_API_KEY}`
  // redirect(url)

  // Since this is a demo without actual credentials, we mock the callback:
  redirect('/api/broker/callback?request_token=mock_token_123')
}

export async function disconnectBroker() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await supabase
      .from('broker_connections')
      .update({ status: 'disconnected', encrypted_access_token: null, disconnected_at: new Date().toISOString() })
      .eq('user_id', user.id)
  }

  redirect('/settings')
}
