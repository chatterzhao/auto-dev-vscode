import React, { useState } from 'react';
import styled from 'styled-components';
import { LightBulbIcon } from "@heroicons/react/24/outline";
import { Button } from "../";
import { window, commands } from 'vscode';

const DevelopmentContainer = styled.div`
  margin-top: 16px;
`;

const DevelopmentTextarea = styled.textarea`
  width: 100%;
  height: 100px;
  margin-bottom: 8px;
`;

export const IssueDevelopment: React.FC<{ issueNumber: number }> = ({ issueNumber }) => {
  const [developmentIdea, setDevelopmentIdea] = useState('');
  const [aiResponse, setAiResponse] = useState('');

  const handleSubmit = async () => {
    try {
      const response = await commands.executeCommand('autodev.analyzeGitHubIssueDevelopment', issueNumber, developmentIdea);
      // 添加类型检查和转换
      if (typeof response === 'string') {
        setAiResponse(response);
      } else {
        setAiResponse(JSON.stringify(response));
      }
      setDevelopmentIdea('');
    } catch (error) {
      console.error("Error submitting development idea:", error);
      window.showErrorMessage('Failed to analyze development idea');
    }
  };

  return (
    <DevelopmentContainer>
      <DevelopmentTextarea
        value={developmentIdea}
        onChange={(e) => setDevelopmentIdea(e.target.value)}
        placeholder="输入开发想法..."
      />
      <Button onClick={handleSubmit}>
        <LightBulbIcon className="w-4 h-4 mr-2" />
        分析开发想法
      </Button>
      {aiResponse && (
        <div>
          <h3>AI 助手分析：</h3>
          <p>{aiResponse}</p>
        </div>
      )}
    </DevelopmentContainer>
  );
};