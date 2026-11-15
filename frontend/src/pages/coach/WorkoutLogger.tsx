import { useSearchParams } from 'react-router'
import { PageHeader } from '../../components/ui/Primitives'
import { WorkoutLogger } from '../../components/workout/WorkoutLogger'

export function CoachWorkoutLoggerPage() {
  const editing = useSearchParams()[0].has('edit')
  return (
    <div className="mx-auto max-w-2xl">
      {editing ? (
        <PageHeader title="編輯上課紀錄" description="修改後按「儲存修改」。日期與扣堂狀態不會改變。" />
      ) : (
        <PageHeader title="記錄上課" description="記錄與扣堂是分開的：完成上課後，會再詢問是否扣除一堂課。" />
      )}
      <WorkoutLogger mode="coach" />
    </div>
  )
}
