import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import type { CategoryInput } from '../../types';
import {
  categoriesListResponseSchema,
  categoryDeleteResponseSchema,
  categoryMutationSuccessSchema,
  type CategoriesListResponse,
  type CategoryDeleteResponse,
  type CategoryMutationSuccess,
} from './contracts';

export interface CategoriesListParams {
  includeInactive?: boolean;
}

export interface UpdateCategoryInput {
  categoryId: string;
  updates: Partial<CategoryInput>;
}

export interface DeleteCategoryInput {
  categoryId: string;
  force?: boolean;
}

export interface ReorderCategoryInput {
  categoryId: string;
  displayOrder: number;
}

export const CATEGORIES_QUERY_KEY = ['admin', 'categories'] as const;

export function getCategoriesListQueryKey(params: CategoriesListParams = {}) {
  return [
    ...CATEGORIES_QUERY_KEY,
    'list',
    { includeInactive: Boolean(params.includeInactive) },
  ] as const;
}

export async function fetchCategories(params: CategoriesListParams = {}): Promise<CategoriesListResponse> {
  return rpcWithSchema(
    'admin_list_categories',
    { includeInactive: Boolean(params.includeInactive) },
    categoriesListResponseSchema,
  );
}

export async function createCategory(category: CategoryInput): Promise<CategoryMutationSuccess> {
  return rpcWithSchema(
    'admin_create_category',
    { category },
    categoryMutationSuccessSchema,
  );
}

export async function updateCategory(input: UpdateCategoryInput): Promise<CategoryMutationSuccess> {
  return rpcWithSchema(
    'admin_update_category',
    {
      categoryId: input.categoryId,
      updates: input.updates,
    },
    categoryMutationSuccessSchema,
  );
}

export async function deleteCategory(input: DeleteCategoryInput): Promise<CategoryDeleteResponse> {
  return rpcWithSchema(
    'admin_delete_category',
    {
      categoryId: input.categoryId,
      force: Boolean(input.force),
    },
    categoryDeleteResponseSchema,
  );
}

export async function reorderCategories(orders: ReorderCategoryInput[]): Promise<CategoryMutationSuccess> {
  return rpcWithSchema(
    'admin_reorder_categories',
    { orders },
    categoryMutationSuccessSchema,
  );
}

export function useCategoriesListQuery(params: CategoriesListParams = {}) {
  return useQuery<CategoriesListResponse, Error>({
    queryKey: getCategoriesListQueryKey(params),
    queryFn: () => fetchCategories(params),
  });
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

export function useReorderCategoriesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderCategories,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}
