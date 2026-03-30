import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      project?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    project?: string;
  }
}
