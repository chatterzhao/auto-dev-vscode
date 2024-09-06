import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { ChatBubbleOvalLeftIcon } from "@heroicons/react/24/outline";
import { vscEditorBackground, lightGray, Button } from "../";
import StyledMarkdownPreview from "../markdown/StyledMarkdownPreview";
import { postToIde } from "../../util/ide";
import { CMD_FETCH_GITHUB_ISSUE_COMMENTS, CMD_ADD_GITHUB_ISSUE_COMMENT } from "../../../../src/base/common/configuration/configuration";

const DiscussionContainer = styled.div`
  background-color: ${vscEditorBackground};
  border: 1px solid ${lightGray};
  border-radius: 4px;
  padding: 16px;
  margin-top: 16px;
`;

const DiscussionInput = styled.textarea`
  width: 100%;
  height: 80px;
  margin-top: 16px;
  padding: 8px;
  border: 1px solid ${lightGray};
  border-radius: 4px;
`;

const CommentContainer = styled.div`
  margin-bottom: 16px;
  border-bottom: 1px solid ${lightGray};
  padding-bottom: 8px;
`;

interface Comment {
  id: number;
  body: string;
  user: {
    login: string;
  };
}

export const IssueDiscussion: React.FC<{ issueNumber: number }> = ({ issueNumber }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchComments(issueNumber);
  }, [issueNumber]);

  const fetchComments = async (issueNumber: number) => {
    setIsLoading(true);
    try {
      const response = await postToIde("command/run", {
        input: CMD_FETCH_GITHUB_ISSUE_COMMENTS,
        history: [],
        modelTitle: "",
        slashCommandName: "",
        contextItems: [],
        params: { issueNumber },
        historyIndex: 0,
        selectedCode: []
      });
      if (Array.isArray(response)) {
        setComments(response);
      } else {
        console.error("Unexpected response format:", response);
        setComments([]);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      postToIde("errorPopup", { message: 'Failed to fetch issue comments' });
      setComments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setIsLoading(true);
    try {
      await postToIde("command/run", {
        input: CMD_ADD_GITHUB_ISSUE_COMMENT,
        history: [],
        modelTitle: "",
        slashCommandName: "",
        contextItems: [],
        params: { issueNumber, comment: newComment },
        historyIndex: 0,
        selectedCode: []
      });
      setNewComment('');
      fetchComments(issueNumber);
    } catch (error) {
      console.error("Error adding comment:", error);
      postToIde("errorPopup", { message: 'Failed to add comment' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChatHistory = async () => {
    // 获取当前聊天记录的逻辑
    // 返回格式为 [{ role: 'AI', content: '...' }, { role: 'Human', content: '...' }]
  };

  return (
    <DiscussionContainer>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <>
          {comments.map(comment => (
            <CommentContainer key={comment.id}>
              <ChatBubbleOvalLeftIcon className="w-5 h-5 mr-2" />
              <strong>{comment.user.login}:</strong>
              <StyledMarkdownPreview source={comment.body} />
            </CommentContainer>
          ))}
          <DiscussionInput
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="添加新的讨论..."
            disabled={isLoading}
          />
          <Button onClick={handleAddComment} disabled={isLoading || !newComment.trim()}>
            <ChatBubbleOvalLeftIcon className="w-4 h-4 mr-2" />
            添加评论
          </Button>
        </>
      )}
    </DiscussionContainer>
  );
};