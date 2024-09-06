import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  CogIcon,
  QuestionMarkCircleIcon,
  GlobeAltIcon // 新添加的图标
} from "@heroicons/react/24/outline";
import { vscForeground, vscBackground } from './index'; // 修改这行

const SidebarContainer = styled.div`
  background-color: ${vscBackground};
  width: 48px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16px;
`;

const SidebarItem = styled(Link)`
  color: ${vscForeground};
  width: 32px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
  border-radius: 4px;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
`;

const Sidebar = () => {
  return (
    <SidebarContainer>
      <SidebarItem to="/">
        <HomeIcon className="w-5 h-5" />
      </SidebarItem>
      <SidebarItem to="/chat">
        <ChatBubbleLeftRightIcon className="w-5 h-5" />
      </SidebarItem>
      <SidebarItem to="/github-issues">
        <GlobeAltIcon className="w-5 h-5" />
      </SidebarItem>
      <SidebarItem to="/settings">
        <CogIcon className="w-5 h-5" />
      </SidebarItem>
      <SidebarItem to="/help">
        <QuestionMarkCircleIcon className="w-5 h-5" />
      </SidebarItem>
    </SidebarContainer>
  );
};

export default Sidebar;