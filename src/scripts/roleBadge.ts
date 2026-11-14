export interface ShopRole {
  id: string;
  name: string;
  price: number;
  description: string;
  icon?: string;
  badge_start?: string;
  badge_mid?: string;
  badge_end?: string;
  rarity?: string;
}

export function createRoleBadge(role: ShopRole) {
  const badge = document.createElement('span');
  badge.className = 'discord-role discord-role-prestige';
  const colors = [role.badge_start, role.badge_mid, role.badge_end]
    .filter(color => color && /^#[0-9a-f]{6}$/i.test(color));
  badge.style.setProperty('--role-fill', colors.length > 1 ? `linear-gradient(130deg, ${colors.join(', ')})` : '#283455');
  badge.style.setProperty('--role-ink', '#fff');
  badge.style.setProperty('--role-border', '#ffffff55');
  badge.dataset.rarity = role.rarity || 'rare';
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = role.icon || '✦';
  badge.append(icon, role.name);
  return badge;
}
