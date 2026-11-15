import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { DemoPage, ForgotPasswordPage, LoginPage, ResetPasswordPage, VerifyEmailGate, VerifyEmailPage } from './pages/Login'
import { NotFoundPage } from './pages/NotFound'
import { HomePage } from './pages/public/Home'
import { useData, useSession } from './store/contexts'
import { BILLING_PATH } from './lib/billing'
import { homePath, isCoachRole } from './lib/roles'

const CoachDashboardPage = lazy(() => import('./pages/coach/Dashboard').then((m) => ({ default: m.CoachDashboardPage })))
const StudentDetailPage = lazy(() => import('./pages/coach/StudentDetail').then((m) => ({ default: m.StudentDetailPage })))
const StudentsPage = lazy(() => import('./pages/coach/Students').then((m) => ({ default: m.StudentsPage })))
const CoachDetailPage = lazy(() => import('./pages/coach/CoachDetail').then((m) => ({ default: m.CoachDetailPage })))
const BillingPage = lazy(() => import('./pages/coach/Billing').then((m) => ({ default: m.BillingPage })))
const StudioPage = lazy(() => import('./pages/coach/Studio').then((m) => ({ default: m.StudioPage })))
const AdminPage = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminPage })))
const RevenuePage = lazy(() => import('./pages/coach/Revenue').then((m) => ({ default: m.RevenuePage })))
const CoachSchedulePage = lazy(() => import('./pages/coach/Schedule').then((m) => ({ default: m.CoachSchedulePage })))
const CoachWorkoutLoggerPage = lazy(() => import('./pages/coach/WorkoutLogger').then((m) => ({ default: m.CoachWorkoutLoggerPage })))
const StudentDashboardPage = lazy(() => import('./pages/student/Dashboard').then((m) => ({ default: m.StudentDashboardPage })))
const StudentHistoryPage = lazy(() => import('./pages/student/History').then((m) => ({ default: m.StudentHistoryPage })))
const StudentPlanPage = lazy(() => import('./pages/student/Plan').then((m) => ({ default: m.StudentPlanPage })))
const StudentProgressPage = lazy(() => import('./pages/student/Progress').then((m) => ({ default: m.StudentProgressPage })))
const PrivacyPage = lazy(() => import('./pages/public/Legal').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('./pages/public/Legal').then((m) => ({ default: m.TermsPage })))
const StudentWorkoutPage = lazy(() => import('./pages/student/Workout').then((m) => ({ default: m.StudentWorkoutPage })))

/**
 * The pages an area's tabs lead to. Fetched once the app has settled, so the first tap on a tab
 * doesn't wait for its download (the router keeps showing the old page meanwhile, which feels like
 * the tap was missed). Vite hands the same modules to the lazy pages above.
 */
const AREA_PAGES = {
  coach: () => [
    import('./pages/coach/Dashboard'),
    import('./pages/coach/Students'),
    import('./pages/coach/StudentDetail'),
    import('./pages/coach/Schedule'),
    import('./pages/coach/WorkoutLogger'),
    import('./pages/coach/Revenue'),
  ],
  student: () => [
    import('./pages/student/Dashboard'),
    import('./pages/student/Plan'),
    import('./pages/student/History'),
    import('./pages/student/Progress'),
    import('./pages/student/Workout'),
  ],
}

function RequireRole({ role, children }: { role: 'coach' | 'student'; children: ReactNode }) {
  const { session } = useSession()
  const { data } = useData()
  const location = useLocation()
  useEffect(() => {
    const t = setTimeout(() => void Promise.allSettled(AREA_PAGES[role]()), 1500)
    return () => clearTimeout(t)
  }, [role])
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (session.unverifiedEmail) return <VerifyEmailGate />
  // Self-trackers share the student area.
  if ((isCoachRole(session.role) ? 'coach' : 'student') !== role) return <Navigate to={homePath(session.role)} replace />
  if (role === 'student' && !data.students.some((s) => s.id === session.studentId)) {
    return <Navigate to="/login" replace state={{ missingStudent: true }} />
  }
  return <>{children}</>
}

/** Visitors see the public home page (what it is, prices, policies); signed-in users go to their app. */
function Home() {
  const { session } = useSession()
  if (!session) return <HomePage />
  return <Navigate to={homePath(session.role)} replace />
}

/** NewebPay sends everyone back to /billing; forward to the signed-in user's own billing page, keeping ?result. */
function BillingRedirect() {
  const { session } = useSession()
  const { search } = useLocation()
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={`${BILLING_PATH}${search}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/privacy" element={<Suspense fallback={null}><PrivacyPage /></Suspense>} />
        <Route path="/terms" element={<Suspense fallback={null}><TermsPage /></Suspense>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/coach"
          element={
            <RequireRole role="coach">
              <AppShell />
            </RequireRole>
          }
        >
          <Route index element={<CoachDashboardPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:id" element={<StudentDetailPage />} />
          <Route path="workouts/new" element={<CoachWorkoutLoggerPage />} />
          <Route path="schedule" element={<CoachSchedulePage />} />
          <Route path="revenue" element={<RevenuePage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="studio/coaches/:id" element={<CoachDetailPage />} />
          <Route path="billing" element={<BillingPage />} />
        </Route>
        <Route
          path="/student"
          element={
            <RequireRole role="student">
              <AppShell />
            </RequireRole>
          }
        >
          <Route index element={<StudentDashboardPage />} />
          <Route path="plan" element={<StudentPlanPage />} />
          <Route path="history" element={<StudentHistoryPage />} />
          <Route path="progress" element={<StudentProgressPage />} />
          <Route path="workouts/new" element={<StudentWorkoutPage />} />
          <Route path="billing" element={<BillingPage />} />
        </Route>
        <Route path="/billing" element={<BillingRedirect />} />
        {/* The service owner's page; the server decides who sees it. */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
