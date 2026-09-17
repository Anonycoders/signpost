import { siteConfig } from '@config';
import type { Category, ImpactLevel, LifecycleStage } from '@config';

/**
 * Lookups over the taxonomies defined in site.config.ts.
 *
 * Content is validated against these lists before the site builds, so the
 * getters below only have to cope with unknown ids defensively (never in a
 * successful build) and return a readable placeholder rather than crashing.
 */

const stageById = new Map(siteConfig.lifecycle.map((stage) => [stage.id, stage]));
const categoryById = new Map(siteConfig.categories.map((category) => [category.id, category]));
const impactById = new Map(siteConfig.impactLevels.map((impact) => [impact.id, impact]));

export const stageIds = siteConfig.lifecycle.map((stage) => stage.id);
export const categoryIds = siteConfig.categories.map((category) => category.id);
export const impactIds = siteConfig.impactLevels.map((impact) => impact.id);

export function getStage(id: string): LifecycleStage {
  return (
    stageById.get(id) ?? {
      id,
      label: id,
      description: '',
      tone: 'gray',
    }
  );
}

export function getCategory(id: string): Category {
  return categoryById.get(id) ?? { id, label: id, tone: 'gray' };
}

export function getImpact(id: string): ImpactLevel {
  return (
    impactById.get(id) ?? {
      id,
      label: id,
      description: '',
      tone: 'gray',
      weight: 0,
    }
  );
}

/** Position of a stage in the lifecycle, used to order and to draw progress. */
export function stageIndex(id: string): number {
  return siteConfig.lifecycle.findIndex((stage) => stage.id === id);
}

/** True when a streamline in this stage is finished and no longer changing. */
export function isTerminalStage(id: string): boolean {
  return getStage(id).terminal === true;
}
