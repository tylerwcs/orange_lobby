import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/legacy/Card";

export default function EventNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center bg-canvas p-6">
      <Card className="w-full p-6 text-center">
        <Icon name="info" size={28} className="mx-auto text-brand-ink" />
        <h1 className="mt-3 text-lg font-extrabold">This link isn&apos;t valid.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Please see the registration desk.</p>
      </Card>
    </main>
  );
}
