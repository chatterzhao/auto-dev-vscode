import React, { useState } from 'react';
import { IssuesList } from '../components/github/IssuesList';
import { IssueDiscussion } from '../components/github/IssueDiscussion';
import { IssueSummary } from '../components/github/IssueSummary';
import { IssueDevelopment } from '../components/github/IssueDevelopment';
import { workspace } from 'vscode';

const GitHubIssuesPage: React.FC = () => {
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);

  const config = workspace.getConfiguration('autodev.github');
  let repositoryName = config.get<string>('repositoryName');

  return (
    <div>
      <h1>GitHub Issues for {repositoryName}</h1>
      <IssuesList onSelectIssue={setSelectedIssue} />
      {selectedIssue && (
        <>
          <IssueDiscussion issueNumber={selectedIssue} />
          <IssueSummary issueNumber={selectedIssue} />
          <IssueDevelopment issueNumber={selectedIssue} />
        </>
      )}
    </div>
  );
};

export default GitHubIssuesPage;