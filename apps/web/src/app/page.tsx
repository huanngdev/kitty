import { Button } from "@kitty/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@kitty/ui/components/card";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Kitty</h1>
        <p className="text-lg text-muted-foreground">Let your agents spend. On a leash.</p>
      </div>
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Group kitty for agents</CardTitle>
            <CardDescription>
              Every agent holds a leash with limits, approved payees and an expiry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button>Create your first event</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
