import { LoginForm } from "./login-form";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 pb-24">
      <div className="flex flex-col items-center">
        <Image
          src="/img/background/Logo.webp"
          alt="XiYouQuest"
          width={450}
          height={150}
          priority
          className="drop-shadow-lg max-w-full h-auto"
        />
        <LoginForm />
      </div>
    </div>
  );
}
