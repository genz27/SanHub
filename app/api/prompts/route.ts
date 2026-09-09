import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';
import { cache, CacheKeys, CacheTTL, withCache } from '@/lib/cache';

const PROMPTS_DIR = path.join(process.cwd(), 'data', 'prompts');

// Validation constants
const MAX_NAME_LENGTH = 50;
const MAX_CONTENT_SIZE = 50000; // 50KB
const VALID_NAME_PATTERN = /^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/;

async function ensureDir() {
  try {
    await fs.mkdir(PROMPTS_DIR, { recursive: true });
  } catch {}
}

function sanitizePromptName(name: string): string | null {
  const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
  if (!safeName || !VALID_NAME_PATTERN.test(safeName)) {
    return null;
  }
  return safeName;
}

async function listPromptNames() {
  await ensureDir();
  const files = await fs.readdir(PROMPTS_DIR);
  return files
    .filter((f) => f.endsWith('.txt'))
    .map((f) => {
      const name = f.replace('.txt', '');
      return { id: name, name };
    });
}

async function readPromptTemplate(safeName: string) {
  const content = await fs.readFile(path.join(PROMPTS_DIR, `${safeName}.txt`), 'utf-8');
  return {
    id: safeName,
    name: safeName,
    content: content.trim(),
  };
}

// GET: List prompt names, one template, or the full catalog
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const fields = searchParams.get('fields');

    if (id) {
      const safeName = sanitizePromptName(id);
      if (!safeName) {
        return NextResponse.json({ success: false, error: '名称格式无效' }, {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      const [session, template] = await Promise.all([
        getServerSession(authOptions),
        withCache(`${CacheKeys.PROMPTS}:id:${safeName}`, CacheTTL.PROMPTS, () =>
          readPromptTemplate(safeName)
        ).catch((error: unknown) => {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return null;
          }
          throw error;
        }),
      ]);
      if (!session?.user) {
        return NextResponse.json({ success: false, error: '未登录' }, {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      if (!template) {
        return NextResponse.json({ success: false, error: '模板不存在' }, {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      return NextResponse.json(
        { success: true, data: template },
        { headers: { 'Cache-Control': 'private, max-age=60' } }
      );
    }

    if (fields === 'names') {
      const [session, templates] = await Promise.all([
        getServerSession(authOptions),
        withCache(`${CacheKeys.PROMPTS}:names`, CacheTTL.PROMPTS, listPromptNames),
      ]);
      if (!session?.user) {
        return NextResponse.json({ success: false, error: '未登录' }, {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      return NextResponse.json(
        { success: true, data: templates },
        { headers: { 'Cache-Control': 'private, max-age=60' } }
      );
    }

    const [session, templates] = await Promise.all([
      getServerSession(authOptions),
      withCache(CacheKeys.PROMPTS, CacheTTL.PROMPTS, async () => {
        const names = await listPromptNames();
        return Promise.all(names.map((item) => readPromptTemplate(item.id)));
      }),
    ]);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(
      { success: true, data: templates },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    console.error('List prompts error:', error);
    return NextResponse.json(
      { success: false, error: '获取模板失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// POST: Create or update a prompt template
export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { name, content } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, error: '名称不能为空' }, { status: 400 });
    }
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ success: false, error: '内容不能为空' }, { status: 400 });
    }

    // Validate name length
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { success: false, error: `名称不能超过 ${MAX_NAME_LENGTH} 个字符` },
        { status: 400 }
      );
    }

    // Validate content size
    if (content.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { success: false, error: `内容不能超过 ${MAX_CONTENT_SIZE} 个字符` },
        { status: 400 }
      );
    }

    // Sanitize and validate filename
    const safeName = name.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, MAX_NAME_LENGTH);
    if (!safeName || !VALID_NAME_PATTERN.test(safeName)) {
      return NextResponse.json({ success: false, error: '名称包含无效字符' }, { status: 400 });
    }

    await ensureDir();
    const filePath = path.join(PROMPTS_DIR, `${safeName}.txt`);
    await fs.writeFile(filePath, content.trim(), 'utf-8');
    cache.deleteByPrefix(CacheKeys.PROMPTS);

    return NextResponse.json({
      success: true,
      data: { id: safeName, name: safeName, content: content.trim() },
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Create prompt error:', error);
    return NextResponse.json({ success: false, error: '创建模板失败' }, { status: 500 });
  }
}

// DELETE: Delete a prompt template
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, error: '名称不能为空' }, { status: 400 });
    }

    // Validate name format to prevent path traversal
    const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
    if (!safeName || !VALID_NAME_PATTERN.test(safeName)) {
      return NextResponse.json({ success: false, error: '名称格式无效' }, { status: 400 });
    }

    const filePath = path.join(PROMPTS_DIR, `${safeName}.txt`);

    try {
      await fs.unlink(filePath);
      cache.deleteByPrefix(CacheKeys.PROMPTS);
    } catch {
      return NextResponse.json({ success: false, error: '模板不存在' }, { status: 404 });
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Delete prompt error:', error);
    return NextResponse.json({ success: false, error: '删除模板失败' }, { status: 500 });
  }
}
