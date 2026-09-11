import { Card } from "@/components/ui/Card";
import { AttendeeDetailSkeleton } from "@/components/admin/AttendeeDetailSkeleton";

export default function AttendeeLoading() {
  return (
    <Card className="mx-auto max-w-3xl p-5">
      <AttendeeDetailSkeleton />
    </Card>
  );
}
