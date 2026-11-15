import { CalendarDays, MapPin } from 'lucide-react'
import { Badge, Card, DemoNotice, EmptyState, PageHeader } from '../../components/ui/Primitives'
import { formatDate, formatTime, relativeDay } from '../../lib/format'
import { endOf, STATUS_LABEL } from '../../lib/schedule'
import { useData } from '../../store/contexts'
import { useCurrentStudent } from '../../store/selectors'
import type { Student } from '../../types'

/** 課表: upcoming classes with the teacher. */
export function StudentPlanPage() {
  const student = useCurrentStudent()!
  return (
    <div>
      <PageHeader title="我的課表" />
      <UpcomingClasses student={student} />
      <DemoNotice className="mt-6" />
    </div>
  )
}

function UpcomingClasses({ student }: { student: Student }) {
  const { data } = useData()
  const now = new Date()
  const upcoming = data.appointments
    .filter((a) => a.studentId === student.id && endOf(a) > now.getTime())
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  if (!upcoming.length) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="目前沒有排定的課程" description="老師安排上課時間後，會顯示在這裡。" />
      </Card>
    )
  }
  return (
    <Card className="divide-y divide-line">
      {upcoming.map((a) => {
        const cancelled = a.status === 'cancelled'
        return (
          <div key={a.id} className={`flex items-center gap-4 px-5 py-3.5 ${cancelled ? 'opacity-60' : ''}`}>
            <div className="w-14 shrink-0 text-center">
              <p className="text-xs text-ink-500">{relativeDay(a.startAt)}</p>
              <p className={`tabular text-[17px] font-semibold text-ink-900 ${cancelled ? 'line-through' : ''}`}>{formatTime(a.startAt)}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium text-ink-900 ${cancelled ? 'line-through' : ''}`}>
                {formatDate(a.startAt, { weekday: true })} {formatTime(a.startAt)}–{formatTime(new Date(endOf(a)))}
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                <MapPin className="size-3 shrink-0" />
                {a.location}・{a.durationMin} 分鐘
              </p>
            </div>
            {cancelled && <Badge>{STATUS_LABEL[a.status]}</Badge>}
          </div>
        )
      })}
    </Card>
  )
}
