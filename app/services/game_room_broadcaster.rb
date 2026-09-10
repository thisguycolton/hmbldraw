class GameRoomBroadcaster
  # --------------------------------------------------------------------------
  # Lobby
  # --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Lobby
# --------------------------------------------------------------------------

def self.lobby_updated(game_room)
  game = game_room.current_game

  ActionCable.server.broadcast("game_room:#{game_room.id}", {
    type: "lobby_updated",

    game_room: {
      id: game_room.id,
      code: game_room.code,
      status: game_room.status,
      current_round: game_room.current_round,
      total_rounds: game_room.total_rounds,
      round_duration: game_room.round_duration,

      category: game&.category && {
        id: game.category.id,
        name: game.category.name,
        slug: game.category.slug
      },
      difficulty: game&.difficulty
    },

    players: game_room.players
      .where(connected: true)
      .order(:position)
      .map do |player|
        {
          id: player.id,
          name: player.name,
          score: player.score,
          position: player.position,
          connected: player.connected
        }
      end
  })
end

  # --------------------------------------------------------------------------
  # Game started
  # --------------------------------------------------------------------------

  def self.game_started(game_room, round)
    ActionCable.server.broadcast(
      "game_room:#{game_room.id}",
      {
        type: "game_started",
        game_room: {
          id: game_room.id,
          code: game_room.code,
          status: game_room.status,
          current_round: game_room.current_round,
          total_rounds: game_room.total_rounds,
          round_duration: game_room.round_duration
        },
        round: {
          id: round.id,
          number: round.number,
          drawer: {
            id: round.drawer.id,
            name: round.drawer.name
          }
        }
      }
    )
  end

  # --------------------------------------------------------------------------
  # Round starting
  # --------------------------------------------------------------------------

  def self.round_starting(game_room, round)
    ActionCable.server.broadcast(
      "game_room:#{game_room.id}",
      {
        type: "round_starting",

        round: {
          id: round.id,
          number: round.number,
          drawer: {
            id: round.drawer.id,
            name: round.drawer.name
          }
        },

        ready_player_ids:
          round.round_readies.pluck(:player_id)
      }
    )
  end

  # --------------------------------------------------------------------------
  # Word options
  # --------------------------------------------------------------------------

  def self.word_options(player, round)
    ActionCable.server.broadcast(
      "player:#{player.id}",
      {
        type: "word_options",
        round: {
          id: round.id,
          number: round.number
        },
        words: round.word_options
      }
    )
  end

  # --------------------------------------------------------------------------
  # Round started / drawing
  # --------------------------------------------------------------------------

def self.round_started(game_room, round)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "round_started",
      round: {
        id: round.id,
        number: round.number,
        drawer: {
          id: round.drawer.id,
          name: round.drawer.name
        },
        started_at: round.started_at.iso8601,
        duration: game_room.round_duration,
        strokes: Array(round.strokes)
      }
    }
  )
end

  # --------------------------------------------------------------------------
# Live drawing
# --------------------------------------------------------------------------

def self.stroke_started(game_room, round, stroke)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "stroke_started",
      round: {
        id: round.id,
        number: round.number
      },
      stroke: stroke
    }
  )
end

def self.stroke_points(game_room, round, stroke)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "stroke_points",
      round: {
        id: round.id,
        number: round.number
      },
      stroke: stroke
    }
  )
end

# --------------------------------------------------------------------------
# Completed drawing operation
# --------------------------------------------------------------------------

def self.stroke_drawn(game_room, round, stroke)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "stroke_drawn",
      round: {
        id: round.id,
        number: round.number
      },
      stroke: stroke
    }
  )
end

# --------------------------------------------------------------------------
# Round ended
# --------------------------------------------------------------------------

def self.round_ended(game_room, round, scores: [])
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "round_ended",

      game_room: {
        id: game_room.id,
        code: game_room.code,
        status: game_room.status,
        current_round: game_room.current_round,
        total_rounds: game_room.total_rounds,
        round_duration: game_room.round_duration
      },

      final: game_room.status == "finished",

      scores: scores,

      round: {
        id: round.id,
        number: round.number,

        drawer: {
          id: round.drawer.id,
          name: round.drawer.name
        },

        winner:
          if round.winner
            {
              id: round.winner.id,
              name: round.winner.name
            }
          end,

        word: round.word,

        guesses:
          round.guesses
            .includes(:player)
            .order(:created_at)
            .map do |guess|
              {
                id: guess.id,
                player: {
                  id: guess.player.id,
                  name: guess.player.name
                },
                text: guess.text,
                correct: guess.correct
              }
            end,

        # --------------------------------------------------------------
        # Persisted drawing.
        #
        # Round.strokes is the authoritative completed drawing.
        # --------------------------------------------------------------

        strokes: Array(round.strokes),

        ended_at: round.ended_at&.iso8601
      }
    }
  )
end

def self.score_updated(game_room, scores)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "score_updated",
      scores: scores
    }
  )
end

def self.game_finished(game_room, scores)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "game_finished",
      game_room: {
        id: game_room.id,
        code: game_room.code,
        status: game_room.status,
        current_round: game_room.current_round,
        total_rounds: game_room.total_rounds,
        round_duration: game_room.round_duration
      },
      scores: scores
    }
  )
end
# --------------------------------------------------------------------------
# Guess submitted
# --------------------------------------------------------------------------

def self.guess_submitted(game_room, guess)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "guess_submitted",

      round: {
        id: guess.round.id,
        number: guess.round.number
      },

      guess: {
        id: guess.id,

        player: {
          id: guess.player.id,
          name: guess.player.name
        },

        text: guess.text,
        correct: guess.correct
      }
    }
  )
end

def self.correct_guess(game_room, round, guess)
  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "correct_guess",
      round: {
        id: round.id,
        number: round.number
      },
      player: {
        id: guess.player.id,
        name: guess.player.name
      }
    }
  )
end

def self.player_ready(game_room, round, player)
  ready_player_ids =
    round.round_readies.pluck(:player_id)

  ActionCable.server.broadcast(
    "game_room:#{game_room.id}",
    {
      type: "player_ready",
      round: {
        id: round.id,
        number: round.number
      },
      player: {
        id: player.id,
        name: player.name
      },
      ready_player_ids: ready_player_ids
    }
  )
end
end
