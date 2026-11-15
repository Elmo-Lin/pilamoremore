import { useSearchParams } from 'react-router'
import { PageHeader } from '../../components/ui/Primitives'
import { WorkoutLogger } from '../../components/workout/WorkoutLogger'
import { useCurrentStudent } from '../../store/selectors'

export function StudentWorkoutPage() {
  const student = useCurrentStudent()!
  const editing = useSearchParams()[0].has('edit')
  return (
    <div className="mx-auto max-w-2xl">
      {editing ? (
        <PageHeader title="編輯上課紀錄" description="修改後按「儲存修改」，日期不會改變。" />
      ) : (
        <PageHeader title="自主練習" description="記錄自己練的內容，老師也看得到你的努力。自主練習不會扣除私人課堂數。" />
      )}
      <WorkoutLogger key={student.id} mode="student" fixedStudentId={student.id} />
    </div>
  )
}
