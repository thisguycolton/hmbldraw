class RoomsController < ApplicationController
  def new
    render inertia: "Rooms/New"
  end

  def create
    @game_room = nil
    @player = nil

    GameRoom.transaction do
      @game_room = GameRoom.create!(
        code: generate_room_code,
        status: "waiting",
        current_round: 0,
        total_rounds: game_room_params[:total_rounds],
        round_duration: game_room_params[:round_duration]
      )

      @player = @game_room.players.create!(
        name: player_params[:name],
        position: 0,
        score: 0,
        connected: true
      )

      @player_token = @player.generate_player_token!
    end

    redirect_to room_path(
      @game_room.code,
      player_token: @player_token
    )
  rescue ActiveRecord::RecordInvalid => e
    errors =
      if e.record.respond_to?(:errors)
        e.record.errors.to_hash
      else
        {}
      end

    render inertia: "Rooms/New",
           props: {
             errors: errors,
             values: {
               name: player_params[:name],
               total_rounds: game_room_params[:total_rounds],
               round_duration: game_room_params[:round_duration]
             }
           },
           status: :unprocessable_entity
  end

def show
  @game_room = GameRoom.includes(:players).find_by!(
    code: params[:id].to_s.upcase
  )

  @player = Player.find_by_player_token(
    params[:player_token].to_s
  )

  @players = @game_room.players.order(:position)
  @current_round =
  if @game_room.current_round.to_i > 0
    @game_room.rounds.find_by(
      number: @game_room.current_round
    )
  end

  render inertia: "Rooms/Show", props: {
    game_room: {
      id: @game_room.id,
      code: @game_room.code,
      status: @game_room.status,
      current_round: @game_room.current_round,
      total_rounds: @game_room.total_rounds,
      round_duration: @game_room.round_duration
    },

    current_player: @player && {
      id: @player.id,
      name: @player.name,
      position: @player.position
    },

    player_token: params[:player_token],

    players: @players.map do |player|
      {
        id: player.id,
        name: player.name,
        score: player.score,
        position: player.position,
        connected: player.connected
      }
    end,
    current_round: @current_round && {
      id: @current_round.id,
      number: @current_round.number,
      drawer: {
        id: @current_round.drawer.id,
        name: @current_round.drawer.name
      },
      started_at: @current_round.started_at&.iso8601,
      duration: @game_room.round_duration
    },
  }
end

  def join
    @game_room = GameRoom.find_by!(code: params[:id].to_s.upcase)

    player_token = params[:player_token].to_s
    existing_player = Player.find_by_player_token(player_token)

    Rails.logger.info(
      "[Join] room=#{@game_room.code} token_present=#{player_token.present?} " \
      "existing_player=#{existing_player&.id}"
    )

    # ------------------------------------------------------------
    # Returning player
    # ------------------------------------------------------------
    if existing_player && existing_player.game_room_id == @game_room.id
      existing_player.update!(connected: true)

      GameRoomBroadcaster.lobby_updated(@game_room)

      redirect_to room_path(@game_room.code)
      return
    end

    # ------------------------------------------------------------
    # New players can only join waiting rooms
    # ------------------------------------------------------------
    unless @game_room.status == "waiting"
      return render inertia: "Rooms/Join",
                    props: {
                      error: "This game has already started."
                    },
                    status: :unprocessable_entity
    end

    name = player_params[:name].to_s.strip

    # ------------------------------------------------------------
    # Prevent duplicate names
    # ------------------------------------------------------------
    if @game_room.players.exists?(name: name)
      return render inertia: "Rooms/Join",
                    props: {
                      error: "That name is already being used in this room."
                    },
                    status: :unprocessable_entity
    end

    # ------------------------------------------------------------
    # Maximum 8 players
    # ------------------------------------------------------------
    next_position = @game_room.players.maximum(:position).to_i + 1

    if next_position >= 8
      return render inertia: "Rooms/Join",
                    props: {
                      error: "This room is full."
                    },
                    status: :unprocessable_entity
    end

    # ------------------------------------------------------------
    # Create new player
    # ------------------------------------------------------------
    @player = @game_room.players.create!(
      name: name,
      position: next_position,
      score: 0,
      connected: true
    )

    @player_token = @player.generate_player_token!

    GameRoomBroadcaster.lobby_updated(@game_room)

    redirect_to room_path(
      @game_room.code,
      player_token: @player_token
    )
  rescue ActiveRecord::RecordInvalid => e
    render inertia: "Rooms/Join",
          props: {
            error: e.record.errors.full_messages.to_sentence
          },
          status: :unprocessable_entity
  end

  def join_page
    render inertia: "Rooms/Join"
  end

  private

  def game_room_params
    params.require(:game_room).permit(
      :total_rounds,
      :round_duration
    )
  end

  def player_params
    params.require(:player).permit(:name)
  end

  def generate_room_code
    loop do
      code = SecureRandom.alphanumeric(4).upcase
      break code unless GameRoom.exists?(code: code)
    end
  end
end
