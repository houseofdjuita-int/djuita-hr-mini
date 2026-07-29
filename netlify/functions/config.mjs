import { env, handlerError, json } from './_lib/shared.mjs'

export default async () => {
  try {
    const { url, publishableKey, authDomain } = env()
    return json({ supabaseUrl: url, supabasePublishableKey: publishableKey, authDomain })
  } catch (error) {
    return handlerError(error)
  }
}
