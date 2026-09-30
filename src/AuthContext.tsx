import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export const ADMIN_EMAIL = 'coppolek@gmail.com';
export const ADMIN_PASS = 'Giuseppe76@';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
}

export type UserRole = 'admin' | 'writer' | 'ticket_manager' | 'ticket_only' | 'viewer' | 'none';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  role: UserRole;
  isAdmin: boolean;
  isWriter: boolean;
  canCreateTicket: boolean;
  canManageTicketStatus: boolean;
  isViewer: boolean;
  setAdminSession: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: 'none',
  isAdmin: false,
  isWriter: false,
  canCreateTicket: false,
  canManageTicketStatus: false,
  isViewer: false,
  setAdminSession: () => {}
});

const createAdminUser = (): AppUser => ({
  uid: 'admin-coppolek',
  email: ADMIN_EMAIL,
  displayName: 'Giuseppe Coppolecchia (Admin)',
  emailVerified: true,
  isAnonymous: false,
});

const mapSupabaseUser = (u: SupabaseUser): AppUser => ({
  uid: u.id,
  email: u.email,
  displayName: u.user_metadata?.display_name || u.email,
  emailVerified: u.email_confirmed_at != null,
  isAnonymous: u.is_anonymous || false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [customAdminUser, setCustomAdminUser] = useState<AppUser | null>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('stt24_admin_session') === 'true') {
      return createAdminUser();
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>('none');

  useEffect(() => {
    const handleLogout = () => {
      setCustomAdminUser(null);
    };
    window.addEventListener('stt24_logout', handleLogout);
    return () => window.removeEventListener('stt24_logout', handleLogout);
  }, []);

  const setAdminSession = () => {
    localStorage.setItem('stt24_admin_session', 'true');
    setCustomAdminUser(createAdminUser());
    setRole('admin');
  };

  useEffect(() => {
    let unsubscribeRole: (() => void) | undefined;

    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        clearTimeout(safetyTimeout);

        const currentUser = session?.user ?? null;
        setUser(currentUser ? mapSupabaseUser(currentUser) : null);

        if (unsubscribeRole) {
          unsubscribeRole();
          unsubscribeRole = undefined;
        }

        if (currentUser) {
          const cleanEmail = currentUser.email?.trim().toLowerCase();

          // Try Firestore roles collection first (backward compat)
          try {
            unsubscribeRole = onSnapshot(collection(db, 'roles'), (snapshot) => {
              let matchedRole: UserRole | null = null;

              const docByUid = snapshot.docs.find(d => d.id === currentUser.id);
              if (docByUid?.data()?.role) {
                matchedRole = docByUid.data().role as any;
              }

              if (!matchedRole && cleanEmail) {
                const docByEmailId = snapshot.docs.find(d => d.id.toLowerCase() === cleanEmail);
                if (docByEmailId?.data()?.role) {
                  matchedRole = docByEmailId.data().role as any;
                }
              }

              if (!matchedRole && cleanEmail) {
                const docByField = snapshot.docs.find(d => d.data()?.email?.trim().toLowerCase() === cleanEmail);
                if (docByField?.data()?.role) {
                  matchedRole = docByField.data().role as any;
                }
              }

              if (matchedRole) {
                setRole(matchedRole);
              } else {
                // Fallback: check Supabase user_roles table
                fetchSupabaseRole(currentUser.id, cleanEmail).then(sbRole => {
                  setRole(sbRole || 'none');
                });
              }
              setLoading(false);
            }, () => {
              // Firestore error (e.g. blocked), try Supabase
              fetchSupabaseRole(currentUser.id, cleanEmail).then(sbRole => {
                setRole(sbRole || 'none');
                setLoading(false);
              });
            });
          } catch (err) {
            // Firestore unavailable, try Supabase
            fetchSupabaseRole(currentUser.id, cleanEmail).then(sbRole => {
              setRole(sbRole || 'none');
              setLoading(false);
            });
          }
        } else {
          setRole('none');
          setLoading(false);
        }
      })();
    });

    return () => {
      clearTimeout(safetyTimeout);
      authListener.subscription.unsubscribe();
      if (unsubscribeRole) unsubscribeRole();
    };
  }, []);

  const fetchSupabaseRole = async (userId: string, email?: string): Promise<UserRole | null> => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .or(`user_id.eq.${userId},email.eq.${email || ''}`)
        .maybeSingle();
      return (data?.role as UserRole) || null;
    } catch {
      return null;
    }
  };

  const effectiveUser = user || customAdminUser;
  const isCoppolek = effectiveUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const isAdmin = isCoppolek || role === 'admin';
  const isWriter = isAdmin || role === 'writer' || role === 'ticket_manager';
  const canManageTicketStatus = isAdmin || role === 'writer' || role === 'ticket_manager';
  const canCreateTicket = (isAdmin || role === 'writer' || role === 'ticket_only') && role !== 'ticket_manager';
  const isViewer = isWriter || canCreateTicket || role === 'viewer';
  const effectiveRole = isAdmin ? 'admin' : role;

  return (
    <AuthContext.Provider value={{
      user: effectiveUser,
      loading,
      role: effectiveRole,
      isAdmin,
      isWriter,
      canCreateTicket,
      canManageTicketStatus,
      isViewer,
      setAdminSession
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
