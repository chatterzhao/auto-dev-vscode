import React, { useState } from 'react';
import styled from 'styled-components';
import { ArrowUpOnSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "../";
import { window, commands } from 'vscode';

const SummaryContainer = styled.div`
  margin-top: 16px;
`;

const SummaryTextarea = styled.textarea`
  width: 100%;
  height: 100px;
  margin-bottom: 8px;
`;

export const IssueSummary: React.FC<{ issueNumber: number }> = ({ issueNumber }) => {
  const [summary, setSummary] = useState('');

  const handleSubmit = async () => {
    try {
      // 使用 VSCode 命令来提交摘要
      await commands.executeCommand('autodev.submitGitHubIssueSummary', issueNumber, summary);
      setSummary('');
      window.showInformationMessage('Summary submitted successfully');
    } catch (error) {
      console.error("Error submitting summary:", error);
      window.showErrorMessage('Failed to submit summary');
    }
  };

  return (
    <SummaryContainer>
      <SummaryTextarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="输入讨论摘��..."
      />
      <Button onClick={handleSubmit}>
        <ArrowUpOnSquareIcon className="w-4 h-4 mr-2" />
        提交摘要
      </Button>
    </SummaryContainer>
  );
};