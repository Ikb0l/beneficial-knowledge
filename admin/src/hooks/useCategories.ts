import { useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIES_QUERY_KEY,
  useCategoriesListQuery,
  type CategoriesListParams,
} from '../domains/categories/api';
import type { CategoryContract } from '../domains/categories/contracts';
import { adminQueryClient } from '../lib/queryClient';

export type Category = CategoryContract;

const FALLBACK_CATEGORIES: Category[] = [
  { id: 'prophets', categoryKey: 'prophets', name: 'Lives of the Prophets', icon: '', description: '', categoryType: 'normal', questionsPerMatch: 7, questionsPerMatchOverride: null, useGlobalQuestionCount: true, timePerQuestion: 15, minQuestionsRequired: 10, displayOrder: 1, questionCount: 0, easyCount: 0, mediumCount: 0, hardCount: 0, isActive: true },
  { id: 'muhammad', categoryKey: 'muhammad', name: 'Prophet Muhammad', icon: '', description: '', categoryType: 'normal', questionsPerMatch: 7, questionsPerMatchOverride: null, useGlobalQuestionCount: true, timePerQuestion: 15, minQuestionsRequired: 10, displayOrder: 2, questionCount: 0, easyCount: 0, mediumCount: 0, hardCount: 0, isActive: true },
  { id: 'abu_bakr', categoryKey: 'abu_bakr', name: 'Abu Bakr As-Siddiq', icon: '', description: '', categoryType: 'normal', questionsPerMatch: 7, questionsPerMatchOverride: null, useGlobalQuestionCount: true, timePerQuestion: 15, minQuestionsRequired: 10, displayOrder: 3, questionCount: 0, easyCount: 0, mediumCount: 0, hardCount: 0, isActive: true },
  { id: 'umar', categoryKey: 'umar', name: 'Umar ibn Al-Khattab', icon: '', description: '', categoryType: 'normal', questionsPerMatch: 7, questionsPerMatchOverride: null, useGlobalQuestionCount: true, timePerQuestion: 15, minQuestionsRequired: 10, displayOrder: 4, questionCount: 0, easyCount: 0, mediumCount: 0, hardCount: 0, isActive: true },
  { id: 'uthman', categoryKey: 'uthman', name: 'Uthman ibn Affan', icon: '', description: '', categoryType: 'normal', questionsPerMatch: 7, questionsPerMatchOverride: null, useGlobalQuestionCount: true, timePerQuestion: 15, minQuestionsRequired: 10, displayOrder: 5, questionCount: 0, easyCount: 0, mediumCount: 0, hardCount: 0, isActive: true },
  { id: 'ali', categoryKey: 'ali', name: 'Ali ibn Abi Talib', icon: '', description: '', categoryType: 'normal', questionsPerMatch: 7, questionsPerMatchOverride: null, useGlobalQuestionCount: true, timePerQuestion: 15, minQuestionsRequired: 10, displayOrder: 6, questionCount: 0, easyCount: 0, mediumCount: 0, hardCount: 0, isActive: true },
  { id: 'umar_ii_saladin', categoryKey: 'umar_ii_saladin', name: 'Umar II & Saladin', icon: '', description: '', categoryType: 'normal', questionsPerMatch: 7, questionsPerMatchOverride: null, useGlobalQuestionCount: true, timePerQuestion: 15, minQuestionsRequired: 10, displayOrder: 7, questionCount: 0, easyCount: 0, mediumCount: 0, hardCount: 0, isActive: true },
];

export function invalidateCategoriesCache() {
  void adminQueryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
}

export function useCategories(params: CategoriesListParams = {}) {
  const queryClient = useQueryClient();
  const query = useCategoriesListQuery(params);

  const refreshCategories = async () => {
    await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    await query.refetch();
  };

  return {
    categories: query.data?.categories?.length ? query.data.categories : FALLBACK_CATEGORIES,
    isLoading: query.isLoading,
    error: query.error?.message || null,
    refreshCategories,
  };
}

export default useCategories;
