import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background font-sans text-foreground">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-between gap-8 px-16 py-32 sm:items-start">
        <Image
          className="h-5 w-24"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl leading-10 font-semibold tracking-tight">
            To get started, edit the{" "}
            <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-sm">
              page.tsx
            </code>{" "}
            file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-foreground/70">
            Looking for a starting point or more instructions? Head over to{" "}
            <a href="https://vercel.com/templates" className="font-medium underline">
              Templates
            </a>{" "}
            or the{" "}
            <a href="https://nextjs.org/learn" className="font-medium underline">
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-foreground/90 md:w-40"
            href="https://vercel.com/new"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="h-3.5 w-4"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={14}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid px-5 transition-colors hover:bg-foreground/10 md:w-40"
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
