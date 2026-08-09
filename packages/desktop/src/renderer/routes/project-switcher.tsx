import { Check, ChevronsUpDown, FolderKanban, FolderOpen } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { ProjectSummary } from '@/types/ipc';

interface ProjectSwitcherProps {
  projects: ProjectSummary[];
  current: string | null;
  onSelect: (name: string) => void;
  onManage: () => void;
}

/**
 * The one place the current project is chosen. Everything project-scoped —
 * Layout, Lights, Output, People — follows it, so there is no second notion of
 * "the project I'm editing" to drift from the one on stage.
 */
export function ProjectSwitcher({ projects, current, onSelect, onManage }: ProjectSwitcherProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size='lg'
                aria-label='Current project'
                className='aria-expanded:bg-sidebar-accent'
              />
            }
          >
            {/* Pulled back by the button's collapsed padding so the tile lands on the
                same centre line as the nav icons below it. */}
            <div className='bg-sidebar-accent text-sidebar-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-lg group-data-[collapsible=icon]:-ml-2'>
              <FolderOpen className='size-4' />
            </div>
            {/* Collapsed, only the tile fits: keeping the label and chevron in the
                flex row would shove the icon off the rail's centre line. */}
            <div className='grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
              <span className='text-muted-foreground truncate text-xs'>Project</span>
              <span className='truncate font-medium' title={current ?? undefined}>
                {current ?? 'None yet'}
              </span>
            </div>
            <ChevronsUpDown className='ml-auto size-4 group-data-[collapsible=icon]:hidden' />
          </DropdownMenuTrigger>
          <DropdownMenuContent className='min-w-56 rounded-lg' side='bottom' align='start' sideOffset={4}>
            <DropdownMenuLabel>Switch project</DropdownMenuLabel>
            {projects.map((p) => (
              <DropdownMenuItem key={p.name} onClick={() => p.name !== current && onSelect(p.name)}>
                <span className='flex-1 truncate'>{p.name}</span>
                {p.name === current && <Check className='size-4' />}
              </DropdownMenuItem>
            ))}
            {projects.length === 0 && <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onManage}>
              <FolderKanban aria-hidden='true' />
              <span>Manage projects…</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
