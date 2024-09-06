import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { vscListActiveBackground, vscListActiveForeground } from "../";
import { window, commands } from 'vscode';
import { IssueDiscussion } from '../../components/github/IssueDiscussion';
import { IssueSummary } from '../../components/github/IssueSummary';
import { IssueDevelopment } from '../../components/github/IssueDevelopment';
import { postToIde } from "../../util/ide";
import { CMD_NEW_CHAT_SESSION } from "../../../../src/base/common/configuration/configuration";
import { Button } from "../";
import { ChatPanel } from '../chat/ChatPanel';
import { workspace } from 'vscode';

const IssueItem = styled.div`
  display: flex;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  &:hover {
    background-color: ${vscListActiveBackground};
    color: ${vscListActiveForeground};
  }
`;

const ChatContainer = styled.div<{ visible: boolean }>`
  display: ${props => (props.visible ? 'block' : 'none')};
  width: 90%;
  height: 100px;
  border: 1px solid #ccc;
  margin-top: 16px;
  padding: 8px;
  overflow-y: auto;
`;

interface Issue {
  id: number;
  title: string;
  number: number;
}

export const IssuesList: React.FC = () => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [chatVisible, setChatVisible] = useState(false);

  useEffect(() => {
    fetchIssues().then(setIssues);
  }, []);

  const fetchIssues = async () => {
    try {
      const issues = await commands.executeCommand('autodev.fetchGitHubIssues');
      return issues;
    } catch (error) {
      console.error("Error fetching issues:", error);
      window.showErrorMessage('Failed to fetch GitHub issues');
      return [];
    }
  };

  const handleAIDiscussion = async () => {
    if (!selectedIssue) return;
    try {
      await postToIde("command/run", {
        input: CMD_NEW_CHAT_SESSION,
        history: [], // Add appropriate ChatMessage[] here
        modelTitle: "Model Title", // Replace with actual model title
        slashCommandName: "Slash Command", // Replace with actual slash command name
        contextItems: [], // Add appropriate ContextItemWithId[] here
        params: {
          prompt: `这是一个Issue #${selectedIssue}，请先阅读整个项目的代码，然后根据项目上下文理解这���Issue，如果跟这个issue相关，但是issue没有考虑到的问题询问人类是否需要AI进行补充"。`
        },
        historyIndex: 0, // Replace with actual history index if needed
        selectedCode: [] // Add appropriate RangeInFile[] here
      });
      setChatVisible(true);
    } catch (error) {
      console.error("Error starting AI discussion:", error);
      postToIde("errorPopup", { message: 'Failed to start AI discussion' });
    }
  };

  const handleAcceptAll = async () => {
    const issueNumber = selectedIssue;
    const messages = await fetchChatHistory(); // 获取当前聊天记录
    await postToIde("command/run", {
      input: 'autodev.acceptAllAndComment',
      history: [], // Add appropriate ChatMessage[] here
      modelTitle: "Model Title", // Replace with actual model title
      slashCommandName: "Slash Command", // Replace with actual slash command name
      contextItems: [], // Add appropriate ContextItemWithId[] here
      params: { issueNumber, messages },
      historyIndex: 0, // Replace with actual history index if needed
      selectedCode: [] // Add appropriate RangeInFile[] here
    });
  };

  const handleAICoding = async () => {
    if (!selectedIssue) return;
    try {
      const response = await postToIde("command/run", {
        input: 'autodev.analyzeGitHubIssueDevelopment',
        history: [], // Add appropriate ChatMessage[] here
        modelTitle: "Model Title", // Replace with actual model title
        slashCommandName: "Slash Command", // Replace with actual slash command name
        contextItems: [], // Add appropriate ContextItemWithId[] here
        params: { issueNumber: selectedIssue },
        historyIndex: 0, // Replace with actual history index if needed
        selectedCode: [] // Add appropriate RangeInFile[] here
      });
      // 处理 AI 返回的代码
      console.log("AI 生成的代码:", response);
    } catch (error) {
      console.error("Error generating code:", error);
      postToIde("errorPopup", { message: 'Failed to generate code' });
    }
  };

  const fetchChatHistory = async () => {
    // 获取当前聊天记录的逻辑
    // 返回格式为 [{ role: 'AI', content: '...' }, { role: 'Human', content: '...' }]
  };

  const config = workspace.getConfiguration('autodev.github');
  let repositoryName = config.get<string>('repositoryName');

  return (
    <div>
      <h1>GitHub Issues for {repositoryName}</h1>
      <div>
        {issues.map(issue => (
          <IssueItem key={issue.id} onClick={() => setSelectedIssue(issue.number)}>
            <GlobeAltIcon className="w-5 h-5 mr-2" />
            #{issue.number} {issue.title}
          </IssueItem>
        ))}
      </div>
      {selectedIssue && (
        <>
          <IssueDiscussion issueNumber={selectedIssue} />
          <IssueSummary issueNumber={selectedIssue} />
          <IssueDevelopment issueNumber={selectedIssue} />
          <Button onClick={handleAIDiscussion}>AI 讨论</Button>
          <Button onClick={handleAICoding}>AI Codding</Button>
          <ChatContainer visible={chatVisible}>
            <ChatPanel />
            <Button onClick={handleAcceptAll}>Accept All</Button>
          </ChatContainer>
        </>
      )}
    </div>
  );
};