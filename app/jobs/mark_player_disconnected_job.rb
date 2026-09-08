class MarkPlayerDisconnectedJob < ApplicationJob
  queue_as :default

  def perform(player_id)
    player = Player.find_by(id: player_id)
    return unless player

    # The player may have reconnected while this job was waiting.
    return if player.connected?

    GameRoomBroadcaster.lobby_updated(player.game_room)
  end
end
