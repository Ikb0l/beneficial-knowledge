import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import CommandPalette from './CommandPalette';
import { useAdminAuthStore } from '../../stores/authStore';

describe('CommandPalette', () => {
  beforeEach(() => {
    useAdminAuthStore.setState((state) => ({
      ...state,
      admin: {
        isAdmin: true,
        adminLevel: 'admin',
        roleKey: 'admin',
        userId: 'admin-user',
        telegramId: 1,
        displayName: 'Admin',
        capabilities: ['dashboard.view', 'home_control.view'],
        featureFlags: [],
      },
      isAuthenticated: true,
      isLoading: false,
    }));
  });

  it('shows only routes allowed by capability and runs logout from the keyboard', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const logoutSpy = vi.fn();

    useAdminAuthStore.setState((state) => ({
      ...state,
      logout: logoutSpy,
    }));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <CommandPalette open onClose={onClose} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.queryByText('Jobs')).toBeNull();
    expect(screen.getByText('Home Control')).toBeTruthy();

    const input = screen.getByPlaceholderText('Search pages and admin actions...');
    await user.type(input, 'logout{Enter}');

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
