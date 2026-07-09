// Pattern 3: 5 sequential independent await calls
async function loadUserDashboard(userId: string) {
  const user = await fetchUser(userId);
  const posts = await fetchPosts(userId);
  const comments = await fetchComments(userId);
  const followers = await fetchFollowers(userId);
  const notifications = await fetchNotifications(userId);

  return {
    user,
    posts,
    comments,
    followers,
    notifications,
  };
}

async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

async function fetchPosts(userId: string) {
  const res = await fetch(`/api/users/${userId}/posts`);
  return res.json();
}

async function fetchComments(userId: string) {
  const res = await fetch(`/api/users/${userId}/comments`);
  return res.json();
}

async function fetchFollowers(userId: string) {
  const res = await fetch(`/api/users/${userId}/followers`);
  return res.json();
}

async function fetchNotifications(userId: string) {
  const res = await fetch(`/api/users/${userId}/notifications`);
  return res.json();
}
