import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const initialCheckDone = useRef(false)

  useEffect(() => {
    // Safety timeout — if auth check takes more than 5 seconds, stop loading
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Auth check timed out — showing login')
        setLoading(false)
      }
    }, 5000)

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserRole(session.user)
      } else {
        setLoading(false)
      }
      initialCheckDone.current = true
    }).catch(() => {
      setLoading(false)
      initialCheckDone.current = true
    })

    // Listen for auth changes (but skip if initial check hasn't completed)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!initialCheckDone.current) return
      if (session?.user) {
        await fetchUserRole(session.user)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const fetchUserRole = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('email', authUser.email)
        .single()

      if (error) {
        console.error('Error fetching user role:', error)
        // Still set the user with basic info so they can access the app
        setUser({
          ...authUser,
          full_name: authUser.email,
          role: 'viewer',
        })
      } else {
        setUser({
          ...authUser,
          full_name: data.full_name,
          role: data.role,
        })
      }
    } catch (err) {
      console.error('Error fetching user role:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email, password) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      await fetchUserRole(data.user)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return {
    user,
    loading,
    error,
    signIn,
    signOut,
  }
}
