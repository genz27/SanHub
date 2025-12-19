import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyPassword, getUserById, initializeDatabase } from './db';
import type { SafeUser } from '@/types';

// ========================================
// NextAuth 配置
// ========================================

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('请输入邮箱和密码');
        }

        // 初始化数据库 (首次运行)
        await initializeDatabase();

        const user = await verifyPassword(
          credentials.email,
          credentials.password
        );

        if (!user) {
          throw new Error('邮箱或密码错误');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          balance: user.balance,
        };
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      // 登出后跳转到登录页
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // 允许同源跳转
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
    async jwt({ token, user, trigger, session }) {
      // 初次登录
      if (user) {
        token.id = user.id as string;
        token.role = (user as SafeUser).role;
        token.balance = (user as SafeUser).balance;
      }

      // 手动触发 session 更新时刷新用户数据
      if (trigger === 'update' && session) {
        const freshUser = await getUserById(token.id as string);
        if (freshUser) {
          token.balance = freshUser.balance;
          token.role = freshUser.role;
          token.name = freshUser.name;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'user' | 'admin' | 'moderator';
        
        // 每次都从数据库获取最新余额，避免缓存导致积分不一致
        try {
          const freshUser = await getUserById(token.id as string);
          if (freshUser) {
            session.user.balance = freshUser.balance;
            session.user.role = freshUser.role;
            session.user.name = freshUser.name;
            session.user.disabled = freshUser.disabled;
          } else {
            session.user.balance = token.balance as number;
          }
        } catch {
          // 数据库查询失败时使用 token 中的缓存值
          session.user.balance = token.balance as number;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 天
  },
  secret: process.env.NEXTAUTH_SECRET,
};
