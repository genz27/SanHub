import { normalizeAspectRatio, normalizePixelSize } from './image-sizing';

export type ResolutionMap = Record<string, string | Record<string, string>>;

export type ResolvedImageTarget = {
  model: string;
  size?: string;
  usedModelFromMapping: boolean;
};

const isSizeValue = (value: string): boolean =>
  Boolean(normalizePixelSize(value) || normalizeAspectRatio(value));

export function resolveImageTarget(
  apiModel: string,
  resolutions: ResolutionMap | undefined,
  aspectRatio?: string,
  imageSize?: string
): ResolvedImageTarget {
  let resolvedModel = apiModel;
  let resolvedSize: string | undefined;
  let usedModelFromMapping = false;

  const applyValue = (value: string | undefined) => {
    if (!value) return;
    if (isSizeValue(value)) {
      resolvedSize = value;
    } else {
      resolvedModel = value;
      usedModelFromMapping = true;
    }
  };

  if (resolutions && aspectRatio) {
    const ratioConfig = resolutions[aspectRatio];
    if (typeof ratioConfig === 'string') {
      applyValue(ratioConfig);
    } else if (ratioConfig && typeof ratioConfig === 'object' && imageSize) {
      applyValue((ratioConfig as Record<string, string>)[imageSize]);
    }
  }

  if (resolutions && imageSize) {
    const sizeConfig = resolutions[imageSize];
    if (typeof sizeConfig === 'string') {
      applyValue(sizeConfig);
    } else if (sizeConfig && typeof sizeConfig === 'object' && aspectRatio) {
      applyValue((sizeConfig as Record<string, string>)[aspectRatio]);
    }
  }

  return { model: resolvedModel, size: resolvedSize, usedModelFromMapping };
}
