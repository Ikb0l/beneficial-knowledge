import type { Category } from '../shared/types/game';

export interface ChallengeCategoryGroup {
  id: string;
  category: Category;
  topics: Category[];
}

export function buildChallengeCategoryGroups(categories: Category[]): ChallengeCategoryGroup[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, Category[]>();

  for (const category of categories) {
    if (!category.parentId || !categoryById.has(category.parentId)) continue;
    const siblings = childrenByParent.get(category.parentId) || [];
    siblings.push(category);
    childrenByParent.set(category.parentId, siblings);
  }

  return categories
    .filter((category) => !category.parentId || !categoryById.has(category.parentId))
    .map((category) => {
      const children = childrenByParent.get(category.id) || [];
      return {
        id: category.id,
        category,
        topics: children.length > 0 ? children : [category],
      };
    });
}
