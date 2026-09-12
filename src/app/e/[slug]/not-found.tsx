import { Icon } from "@/components/ui/icon";
import { Card, CardContent } from "@/components/ui/card";

export default function EventNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center bg-background p-6">
      <Card className="w-full"><CardContent className="text-center">
        <Icon name="info" size={28} className="mx-auto text-primary" />
        <h1 className="mt-3 text-lg font-extrabold">This link isn&apos;t valid.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Please see the registration desk.</p>
      </CardContent></Card>
    </main>
  );
}
