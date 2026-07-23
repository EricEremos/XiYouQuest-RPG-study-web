import { LoginForm } from "./login-form";
import Image from "next/image";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center px-3 py-8 sm:p-4 sm:pb-24">
      <div className="flex w-full min-w-0 max-w-md flex-col items-center">
        <Image
          src="/img/background/Logo.webp"
          alt="XiYouQuest emblem"
          width={450}
          height={197}
          priority
          sizes="(max-width: 480px) 94vw, 450px"
          className="h-auto w-full max-w-[450px] drop-shadow-lg"
        />
        <h1 className="mb-4 text-center font-pixel text-base leading-relaxed text-primary pixel-glow">
          XiYouQuest
        </h1>
        <LoginForm error={error} />
      </div>
    </main>
  );
}
