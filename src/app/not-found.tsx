import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl font-bold text-muted-foreground">404</div>
      <p className="text-sm text-muted-foreground">This page doesn’t exist.</p>
      <Link href="/chat" className={buttonVariants({ variant: "outline" })}>
        Back to chat
      </Link>
    </div>
  );
}
