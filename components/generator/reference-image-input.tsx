'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  ImagePlus,
  Plus,
  X,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { ReusableImageReference } from '@/lib/generation-client';
import { cn } from '@/lib/utils';

export type ReferenceImageItem = {
  file: File;
  preview: string;
};

type ReferenceImageInputProps = {
  images: ReferenceImageItem[];
  externalReference?: ReusableImageReference | null;
  emptyLabel?: string;
  externalBadge?: string;
  listenForPaste?: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onClearExternalReference?: () => void;
};

function getImageFilesFromList(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => file.type.startsWith('image/'));
}

function getImageFilesFromItems(items: DataTransferItemList): File[] {
  return Array.from(items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function getImageFilesFromTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];

  const itemFiles = getImageFilesFromItems(dataTransfer.items);
  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return getImageFilesFromList(dataTransfer.files);
}

function getExtensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.split('+')[0];
  return subtype || 'png';
}

async function readClipboardImageFiles(): Promise<File[]> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    throw new Error('当前浏览器不支持直接读取剪切板图片');
  }

  const clipboardItems = await navigator.clipboard.read();
  const files: File[] = [];

  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;

    const blob = await item.getType(imageType);
    const extension = getExtensionFromMimeType(blob.type || imageType);
    files.push(
      new File([blob], `clipboard-${Date.now()}-${files.length + 1}.${extension}`, {
        type: blob.type || imageType,
      })
    );
  }

  return files;
}

export function ReferenceImageInput({
  images,
  externalReference = null,
  emptyLabel = '参考图',
  externalBadge = '已生成',
  listenForPaste = true,
  onAddFiles,
  onRemoveImage,
  onClearExternalReference,
}: ReferenceImageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const previewUrl = images[0]?.preview || externalReference?.previewUrl || '';
  const totalCount = images.length + (externalReference ? 1 : 0);
  const hiddenCount = Math.max(0, totalCount - 1);

  const addFiles = useCallback(
    (files: File[], source: 'picker' | 'drop' | 'paste' | 'clipboard') => {
      const imageFiles = getImageFilesFromList(files);

      if (imageFiles.length === 0) {
        if (source !== 'picker') {
          toast({
            title: '未发现图片',
            description: '请拖入、粘贴或选择图片文件',
          });
        }
        return;
      }

      onAddFiles(imageFiles);
      setIsExpanded(true);

      if (source === 'paste') {
        toast({
          title: '已粘贴参考图',
          description: `添加 ${imageFiles.length} 张图片`,
        });
      }
    },
    [onAddFiles]
  );

  const handleReadClipboard = useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      event?.preventDefault();
      event?.stopPropagation();

      try {
        const files = await readClipboardImageFiles();
        if (files.length === 0) {
          toast({
            title: '剪切板没有图片',
            description: '请先复制一张图片后再读取',
          });
          return;
        }

        onAddFiles(files);
        setIsExpanded(true);
        toast({
          title: '已读取剪切板图片',
          description: `添加 ${files.length} 张参考图`,
        });
      } catch (err) {
        toast({
          title: '读取剪切板失败',
          description: err instanceof Error ? err.message : '请确认浏览器权限后重试',
          variant: 'destructive',
        });
      }
    },
    [onAddFiles]
  );

  useEffect(() => {
    if (!listenForPaste) return;

    const handleWindowPaste = (event: ClipboardEvent) => {
      const files = getImageFilesFromTransfer(event.clipboardData);
      if (files.length === 0) return;

      event.preventDefault();
      addFiles(files, 'paste');
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [addFiles, listenForPaste]);

  useEffect(() => {
    if (totalCount === 0) {
      setIsExpanded(false);
    }
  }, [totalCount]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []), 'picker');
    event.target.value = '';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    addFiles(getImageFilesFromTransfer(event.dataTransfer), 'drop');
  };

  const removePrimaryReference = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (images.length > 0) {
      onRemoveImage(0);
      return;
    }

    onClearExternalReference?.();
  };

  return (
    <div
      className="relative w-24 shrink-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept="image/*"
        onChange={handleFileChange}
      />

      <button
        type="button"
        onClick={() => {
          if (previewUrl) {
            setIsExpanded((current) => !current);
            return;
          }
          fileInputRef.current?.click();
        }}
        className={cn(
          'relative flex h-20 w-24 flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-all',
          isDragging
            ? 'border-sky-500 bg-sky-500/10'
            : previewUrl
              ? 'border-border/70 bg-card/60'
              : 'border-border/70 hover:border-border hover:bg-card/60'
        )}
      >
        {previewUrl ? (
          <>
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-1.5 py-1">
              <span className="truncate text-[10px] text-white/85">
                {totalCount} 张参考图
              </span>
              {hiddenCount > 0 && (
                <span className="rounded bg-white/15 px-1 text-[10px] text-white">
                  +{hiddenCount}
                </span>
              )}
            </div>
            {externalReference && images.length === 0 && (
              <div className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                {externalBadge}
              </div>
            )}
          </>
        ) : (
          <>
            <ImagePlus className="mb-1 h-5 w-5 text-foreground/40" />
            <span className="text-[10px] text-foreground/40">{emptyLabel}</span>
            <span className="mt-0.5 text-[9px] text-foreground/30">拖拽 / 粘贴</span>
          </>
        )}
      </button>

      {previewUrl && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg transition-colors hover:bg-sky-600"
          aria-label="Add reference image"
          title="新增参考图"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}

      <button
        type="button"
        onClick={handleReadClipboard}
        className="absolute -bottom-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-card text-foreground/70 shadow-lg transition-colors hover:bg-background hover:text-foreground"
        aria-label="Read image from clipboard"
        title="读取剪切板图片"
      >
        <Clipboard className="h-3 w-3" />
      </button>

      {previewUrl && (
        <>
          <button
            type="button"
            onClick={removePrimaryReference}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600"
            aria-label="Remove current reference image"
            title="删除当前参考图"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsExpanded((current) => !current);
            }}
            className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-card text-foreground/70 shadow-lg transition-colors hover:bg-background hover:text-foreground"
            aria-label="Toggle reference image list"
            title={isExpanded ? '收起参考图' : '展开参考图'}
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </>
      )}

      {isExpanded && totalCount > 0 && (
        <div className="absolute left-0 top-full z-30 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border/70 bg-card/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground">参考图</p>
              <p className="text-[10px] text-foreground/45">
                已添加 {totalCount} 张，可单独删除
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-border/70 px-2 py-1 text-[10px] text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
              >
                新增
              </button>
              <button
                type="button"
                onClick={handleReadClipboard}
                className="rounded-md border border-border/70 px-2 py-1 text-[10px] text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
              >
                读剪切板
              </button>
            </div>
          </div>

          <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1">
            {images.map((image, index) => (
              <div
                key={`${image.preview}-${index}`}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-background/60"
              >
                <img src={image.preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveImage(index)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-100 transition-colors hover:bg-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Remove reference image"
                  title="删除这张参考图"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {externalReference && (
              <div className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-background/60">
                <img
                  src={externalReference.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                  {externalBadge}
                </div>
                <button
                  type="button"
                  onClick={() => onClearExternalReference?.()}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-100 transition-colors hover:bg-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Remove reused reference image"
                  title="删除这张参考图"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/40 text-[10px] text-foreground/50 transition-colors hover:border-border hover:bg-background/70 hover:text-foreground"
            >
              <Plus className="mb-1 h-4 w-4" />
              新增
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
