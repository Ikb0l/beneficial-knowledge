import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import type { FeaturedItem, HomeBannerInput } from '../../types';
import {
  homeControlMutationSuccessSchema,
  homeControlSnapshotSchema,
  type HomeControlMutationSuccess,
  type HomeControlSnapshot,
} from './contracts';

export const HOME_CONTROL_SNAPSHOT_QUERY_KEY = ['admin', 'home-control', 'snapshot'] as const;

async function fetchHomeControlSnapshot(): Promise<HomeControlSnapshot> {
  return rpcWithSchema(
    'admin_get_home_control_snapshot',
    { includeInactive: true },
    homeControlSnapshotSchema,
  );
}

export function useHomeControlSnapshot() {
  return useQuery<HomeControlSnapshot, Error>({
    queryKey: HOME_CONTROL_SNAPSHOT_QUERY_KEY,
    queryFn: fetchHomeControlSnapshot,
  });
}

export async function createBanner(banner: HomeBannerInput): Promise<HomeControlMutationSuccess> {
  return rpcWithSchema(
    'admin_create_banner',
    { banner },
    homeControlMutationSuccessSchema,
  );
}

export async function updateBanner(bannerId: string, updates: Partial<HomeBannerInput>): Promise<HomeControlMutationSuccess> {
  return rpcWithSchema(
    'admin_update_banner',
    { bannerId, updates },
    homeControlMutationSuccessSchema,
  );
}

export async function deleteBanner(bannerId: string): Promise<HomeControlMutationSuccess> {
  return rpcWithSchema(
    'admin_delete_banner',
    { bannerId },
    homeControlMutationSuccessSchema,
  );
}

export async function setFeaturedItems(items: Array<Pick<FeaturedItem, 'itemType' | 'itemId' | 'displayOrder'>>): Promise<HomeControlMutationSuccess> {
  return rpcWithSchema(
    'admin_set_featured_items',
    { items },
    homeControlMutationSuccessSchema,
  );
}

export async function updateHomeSections(
  sections: Array<{ sectionKey: string; isVisible: boolean; displayOrder: number }>,
): Promise<HomeControlMutationSuccess> {
  return rpcWithSchema(
    'admin_update_home_sections',
    { sections },
    homeControlMutationSuccessSchema,
  );
}

function useHomeControlMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<HomeControlMutationSuccess>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HOME_CONTROL_SNAPSHOT_QUERY_KEY });
    },
  });
}

export function useCreateBannerMutation() {
  return useHomeControlMutation(createBanner);
}

export function useUpdateBannerMutation() {
  return useHomeControlMutation(({ bannerId, updates }: { bannerId: string; updates: Partial<HomeBannerInput> }) =>
    updateBanner(bannerId, updates));
}

export function useDeleteBannerMutation() {
  return useHomeControlMutation((bannerId: string) => deleteBanner(bannerId));
}

export function useSetFeaturedItemsMutation() {
  return useHomeControlMutation(setFeaturedItems);
}

export function useUpdateHomeSectionsMutation() {
  return useHomeControlMutation(updateHomeSections);
}
