const selectButton = document.getElementById('select-channel');
const channelInput = document.getElementById('channel-input');

/** The player config to use in order to initialize the player */
const VOD_CONFIG = {
  playlist: 'https://cdn.jwplayer.com/v2/media/8L4m9FJB',
  repeat: true
};

/**
 * How often we should be checking for an update to the live status.
 * 10 seconds is generally a good frequency, it is not useful to check more often.
 */
const UPDATE_FREQUENCY = 10 * 1e3;

/**
 * The maximum number of times we'll try before giving up configuring a player.
 * @type {number}
 */
const MAX_RETRIES = 5;

/** The player on the page which we'll use for playback */
const playerInstance = jwplayer('player').setup(VOD_CONFIG);

/** The identifier of the channel for which we should be fetching updates */
let channelId;

/** An id used by the setInterval()/clearInterval() functions in order to manage the update loop. */
let intervalId;

// Register an event listener for the selectButton.
selectButton.addEventListener('click', (event) => {
  event.preventDefault();
  if (intervalId) {
    // If an update loop was already running, stop it.
    intervalId = clearInterval(intervalId);
  }

  // Validate the provided channel id.
  channelId = channelInput.value;

  if (!channelId.match(/[a-zA-Z0-9]{8}/)) {
    alert("The provided channel id is not a valid JW Live 2.0 channel id.");
    return;
  }

  // Start the update loop.
  checkChannelStatus();
});

/**
 * Periodically checks whether the specified livestream channel is available, and if it is, configures the player
 * to start playing it.
 */
function checkChannelStatus() {
  if (!intervalId) {
    // Make sure to execute this method every UPDATE_FREQUENCY milliseconds.
    intervalId = setInterval(checkChannelStatus, UPDATE_FREQUENCY);
  }
  getChannelStatus(channelId).then((channelStatus) => {
    console.log(`Received channel status: %O`, channelStatus);
    if (channelStatus['status'] === 'active') {
      // Determine the id of the active event based on the returned status.
      const eventId = channelStatus['current_event'];
      configurePlayer(eventId).catch((error) => {
        alert(`Failed to start livestream playback: ${error}`);
      });
      clearInterval(intervalId);
    }
  }, (error) => {
    console.error(`Unable to fetch the channel status for ${channelId}: ${error}`);
  });
}

/**
 * (Re-)configures the active playerInstance to play the livestream identified by eventId.
 */
async function configurePlayer(eventId) {
  // There may be a slight delay between the livestream becoming available, and its playlist to become available.
  // Therefore, we first attempt to fetch the playlist for the new live event, as soon as we have successfully fetched
  // a playlist, we will load it on the player and start playback of the livestream.
  let playlist;
  let attempts = 0;
  while (!playlist) {
    try {
      playlist = await getPlaylist(eventId);
    } catch (e) {
      ++attempts;
      console.error(e);
      if (attempts >= MAX_RETRIES) {
        throw e;
      }
      // Retry with exponential backoff, i.e. first retry after 5, 10, 20, 40, 80 seconds
      // after which we ultimately give up.
      await sleep(2 ** (attempts - 1) * 5 * 1000);
    }
  }

  // Once a playlist is available, use it to configure the player.
  playerInstance.load(playlist.playlist);
  // Start playback
  console.log('Starting livestream playback.');
  playerInstance.play();
}

/**
 * Utility function to fetch a JSON document.
 * @param url
 */
async function fetchJSON(url) {
  return await fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to fetch ${url}: ${response.statusText}`);
      }
      return response.json();
    });
}

/**
 * Fetches the current status of a JW Live 2.0 channel.
 * Returns a promise that will yield the status for a particular channel.
 *
 * @param channelId The channel to fetch the status for.
 */
function getChannelStatus(channelId) {
  return fetchJSON(`https://cdn.jwplayer.com/live/channels/${channelId}.json`);
}

/**
 * Fetches a JW Platform playlist for a particular media item.
 *
 * @param mediaId The media id to fetch a single item playlist for.
 */
function getPlaylist(mediaId) {
  return fetchJSON(`https://cdn.jwplayer.com/v2/media/${mediaId}`);
}

/**
 * A simple utility method which can be used to wait for some time between retries.
 *
 * @param ms The amount of milliseconds to wait between retries.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
